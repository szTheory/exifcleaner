#
# Win32::API::Struct - Perl Win32 API struct Facility
#
# Author: Aldo Calpini <dada@perl.it>
# Maintainer: Cosimo Streppone <cosimo@cpan.org>
#

package Win32::API::Struct;
use strict;
use warnings;
use vars qw( $VERSION );
$VERSION = '0.67';

my %Known = ();

#import DEBUG sub
sub DEBUG;
*DEBUG = *Win32::API::DEBUG;

#package main;
#
#sub userlazyapisub2{
#    userlazyapisub();
#}
#sub userlazyapisub {
#    Win32::API::Struct::lazyapisub();
#}
#
#sub userapisub {
#    Win32::API::Struct::apisub();
#}
#
#package Win32::API::Struct;
#
#sub lazyapisub {
#    lazycarp('bad');
#}
#sub apisub {
#    require Carp;
#    Carp::carp('bad');
#}
sub lazycarp {
    require Carp;
    Carp::carp(@_);
}

sub lazycroak {
    require Carp;
    Carp::croak(@_);
}

sub typedef {
    my $class  = shift;
    my $struct = shift;
    my ($type, $name, @recog_arr);
    my $self = {
        align   => undef,
        typedef => [],
    };
    while (defined($type = shift)) {
        #not compatible with "unsigned foo;"
        $type .= ' '.shift if $type eq 'unsigned' || $type eq 'signed';
        $name = shift;
        #"int foo [8];" instead of "int foo[8];" so tack on the array count
        {
            BEGIN{warnings->unimport('uninitialized')}
            $name .= shift if substr($_[0],0,1) eq '[';
        }
        #typedef() takes a list, not a str, for backcompat, this can't be changed
        #but, should typedef() keep shifting slices until it finds ";" or not?
        #all the POD examples have ;s, but they are actually optional, should it
        #be assumed that existing code was nice and used ;s or not? backcompat
        #breaks if you say ;-less member defs should be allowed and aren't a user
        #mistake
        $name =~ s/;$//;
        @recog_arr = recognize($type, $name);
#http://perlmonks.org/?node_id=978468, not catching the type not found here,
#will lead to a div 0 later
        if(@recog_arr != 3){ 
            lazycarp "Win32::API::Struct::typedef: unknown member type=\"$type\", name=\"$name\"";
            return undef;
        }
        push(@{$self->{typedef}}, [@recog_arr]);
    }

    $Known{$struct} = $self;
    $Win32::API::Type::Known{$struct} = '>';
    return 1;
}


#void ck_type($param, $proto, $param_num)
sub ck_type {
    my ($param, $proto) = @_;
    #legacy LP prefix check
    return if substr($proto, 0, 2) eq 'LP' && substr($proto, 2) eq $param;
    #check if proto can be converted to base struct name
    return if exists $Win32::API::Struct::Pointer{$proto} &&
            $param eq $Win32::API::Struct::Pointer{$proto};
    #check if proto can have * chopped off to convert to base struct name
    $proto =~ s/\s*\*$//;
    return if $proto eq $param;
    lazycroak("Win32::API::Call: supplied type (LP)\"".
          $param."\"( *) doesn't match type \"".
          $_[1]."\" for parameter ".
          $_[2]." ");
}

#$basename = to_base_struct($pointername)
sub to_base_struct {
    return $Win32::API::Struct::Pointer{$_[0]}
        if exists $Win32::API::Struct::Pointer{$_[0]};
    die "Win32::API::Struct::Unpack unknown type";
}

sub recognize {
    my ($type, $name) = @_;
    my ($size, $packing);

    if (exists $Known{$type}) {
        $packing = '>';
        return ($name, $packing, $type);
    }
    else {
        $packing = Win32::API::Type::packing($type);
        return undef unless defined $packing;
        if ($name =~ s/\[(.*)\]$//) {
            $size    = $1;
            $packing = $packing . '*' . $size;
        }
        DEBUG "(PM)Struct::recognize got '$name', '$type' -> '$packing'\n" if DEBUGCONST;
        return ($name, $packing, $type);
    }
}

sub new {
    my $class = shift;
    my ($type, $name, $packing);
    my $self = {typedef => [],};
    if ($#_ == 0) {
        if (is_known($_[0])) {
            DEBUG "(PM)Struct::new: got '$_[0]'\n" if DEBUGCONST;
            if( ! defined ($self->{typedef} = $Known{$_[0]}->{typedef})){
                lazycarp 'Win32::API::Struct::new: unknown type="'.$_[0].'"';
                return undef;
            }
            foreach my $member (@{$self->{typedef}}) {
                ($name, $packing, $type) = @$member;
                next unless defined $name;
                if ($packing eq '>') {
                    $self->{$name} = Win32::API::Struct->new($type);
                }
            }
            $self->{__typedef__} = $_[0];
        }
        else {
            lazycarp "Unknown Win32::API::Struct '$_[0]'";
            return undef;
        }
    }
    else {
        while (defined($type = shift)) {
            $name = shift;

            # print "new: found member $name ($type)\n";
            if (not exists $Win32::API::Type::Known{$type}) {
                lazycarp "Unknown Win32::API::Struct type '$type'";
                return undef;
            }
            else {
                push(@{$self->{typedef}},
                    [$name, $Win32::API::Type::Known{$type}, $type]);
            }
        }
    }
    return bless $self;
}

sub members {
    my $self = shift;
    return map { $_->[0] } @{$self->{typedef}};
}

sub sizeof {
    my $self  = shift;
    my $size  = 0;
    my $align = 0;
    my $first = '';

    for my $member (@{$self->{typedef}}) {
        my ($name, $packing, $type) = @{$member};
        next unless defined $name;
        if (ref $self->{$name} eq q{Win32::API::Struct}) {

            # If member is a struct, recursively calculate its size
            # FIXME for subclasses
            $size += $self->{$name}->sizeof();
        }
        else {

            # Member is a simple type (LONG, DWORD, etc...)
            if ($packing =~ /\w\*(\d+)/) {    # Arrays (ex: 'c*260')
                $size += Win32::API::Type::sizeof($type) * $1;
                $first = Win32::API::Type::sizeof($type) * $1 unless defined $first;
                DEBUG "(PM)Struct::sizeof: sizeof with member($name) now = " . $size
                    . "\n" if DEBUGCONST;
            }
            else {                            # Simple types
                my $type_size = Win32::API::Type::sizeof($type);
                $align = $type_size if $type_size > $align;
                my $type_align = (($size + $type_size) % $type_size);
                $size += $type_size + $type_align;
                $first = Win32::API::Type::sizeof($type) unless defined $first;
            }
        }
    }

    my $struct_size = $size;
    if (defined $align && $align > 0) {
        $struct_size += ($size % $align);
    }
    DEBUG "(PM)Struct::sizeof first=$first totalsize=$struct_size\n" if DEBUGCONST;
    return $struct_size;
}

sub align {
    my $self  = shift;
    my $align = shift;

    if (not defined $align) {

        if (!(defined $self->{align} && $self->{align} eq 'auto')) {
            return $self->{align};
        }

        $align = 0;

        foreach my $member (@{$self->{typedef}}) {
            my ($name, $packing, $type) = @$member;

            if (ref($self->{$name}) eq "Win32::API::Struct") {
                #### ????
            }
            else {
                if ($packing =~ /\w\*(\d+)/) {
                    #### ????
                }
                else {
                    $align = Win32::API::Type::sizeof($type)
                        if Win32::API::Type::sizeof($type) > $align;
                }
            }
        }
        return $align;
    }
    else {
        $self->{align} = $align;

    }
}

sub getPack {
    my $self        = shift;
    my $packing     = "";
    my $packed_size = 0;
    my ($type, $name, $type_size, $type_align);
    my @items      = ();
    my @recipients = ();
    my @buffer_ptrs = (); #this contains the struct_ptrs that were placed in the
    #the struct, its part of "C func changes the struct ptr to a private allocated
    #struct" code, it is push/poped only for struct ptrs, it is NOT a 1 to
    #1 mapping between all struct members, so don't access it with indexes

    my $align = $self->align();

    foreach my $member (@{$self->{typedef}}) {
        my ($name, $type, $orig) = @$member;
        if ($type eq '>') {
            my ($subpacking, $subitems, $subrecipients, $subpacksize, $subbuffersptrs) =
                $self->{$name}->getPack();
            DEBUG "(PM)Struct::getPack($self->{__typedef__}) ++ $subpacking\n" if DEBUGCONST;
            push(@items,      @$subitems);
            push(@recipients, @$subrecipients);
            push(@buffer_ptrs, @$subbuffersptrs);
            $packing .= $subpacking;
            $packed_size += $subpacksize;
        }
        else {
            my $repeat = 1;
            $type_size  = Win32::API::Type::sizeof($orig);
            if ($type =~ /\w\*(\d+)/) {
                $repeat = $1;
                $type = 'a'.($repeat*$type_size);
            }

            DEBUG "(PM)Struct::getPack($self->{__typedef__}) ++ $type\n" if DEBUGCONST;

            if ($type eq 'p') {
                $type = Win32::API::Type::pointer_pack_type();
                push(@items, Win32::API::PointerTo($self->{$name}));
            }
            elsif ($type eq 'T') {
                $type = Win32::API::Type::pointer_pack_type();
                my $structptr;
                if(ref($self->{$name})){
                    $self->{$name}->Pack();
                    $structptr = Win32::API::PointerTo($self->{$name}->{buffer});
                }
                else{
                    $structptr = 0;
                }
                push(@items, $structptr);
                push(@buffer_ptrs, $structptr);
            }
            else {
                push(@items, $self->{$name});
            }
            push(@recipients, $self);
            $type_align = (($packed_size + $type_size) % $type_size);
            $packing .= "x" x $type_align . $type;
            $packed_size += ( $type_size * $repeat ) + $type_align;
        }
    }

    DEBUG
        "(PM)Struct::getPack: $self->{__typedef__}(buffer) = pack($packing, $packed_size)\n" if DEBUGCONST;

    return ($packing, [@items], [@recipients], $packed_size, \@buffer_ptrs);
}

# void $struct->Pack([$priv_warnings_flag]);
sub Pack {
    my $self = shift;
    my ($packing, $items);
    ($packing,  $items,     $self->{buffer_recipients},
     undef,     $self->{buffer_ptrs}) = $self->getPack();

    DEBUG "(PM)Struct::Pack: $self->{__typedef__}(buffer) = pack($packing, @$items)\n" if DEBUGCONST;
    
    if($_[0]){ #Pack() on a new struct, without slice set, will cause lots of uninit
        #warnings, sometimes its intentional to set up buffer recipients for a
        #future UnPack()
        BEGIN{warnings->unimport('uninitialized')}
        $self->{buffer} = pack($packing, @$items);
    }
    else{
        $self->{buffer} = pack($packing, @$items);
    }
    if (DEBUGCONST) {
        for my $i (0 .. $self->sizeof - 1) {
            printf "#pack#    %3d: 0x%02x\n", $i, ord(substr($self->{buffer}, $i, 1));
        }
    }
}

sub getUnpack {
    my $self        = shift;
    my $packing     = "";
    my $packed_size = 0;
    my ($type, $name, $type_size, $type_align, $orig_type);
    my (@items, @types, @type_names);
    my $align = $self->align();
    foreach my $member (@{$self->{typedef}}) {
        my ($name, $type, $orig) = @$member;
        if ($type eq '>') {
            my ($subpacking, $subpacksize, $subitems, $subtypes, $subtype_names) = $self->{$name}->getUnpack();
            DEBUG "(PM)Struct::getUnpack($self->{__typedef__}) ++ $subpacking\n" if DEBUGCONST;
            $packing .= $subpacking;
            $packed_size += $subpacksize;
            push(@items, @$subitems);
            push(@types, @$subtypes);
            push(@type_names, @$subtype_names);
        }
        else {
            if($type eq 'T') {
                $orig_type = $type;
                $type = Win32::API::Type::pointer_pack_type();
            }
            $type_size  = Win32::API::Type::sizeof($orig);
            my $repeat = 1;
            if ($type =~ /\w\*(\d+)/) { #some kind of array
                $repeat = $1;
                $type =
                    $type_size == 1 ?
                        'Z'.$repeat #have pack truncate to NULL char
                        :'a'.($repeat*$type_size); #manually truncate to wide NULL char later
            }
            DEBUG "(PM)Struct::getUnpack($self->{__typedef__}) ++ $type\n" if DEBUGCONST;
            $type_align = (($packed_size + $type_size) % $type_size);
            $packing .= "x" x $type_align . $type;
            $packed_size += ( $type_size * $repeat ) + $type_align;
            push(@items, $name);
            if($orig_type){
                push(@types, $orig_type);
                undef($orig_type);
            }
            else{
                push(@types, $type);
            }
            push(@type_names, $orig);
        }
    }
    DEBUG "(PM)Struct::getUnpack($self->{__typedef__}): unpack($packing, @items)\n" if DEBUGCONST;
    return ($packing, $packed_size, \@items, \@types, \@type_names);
}

sub Unpack {
    my $self = shift;
    my ($packing, undef, $items, $types, $type_names) = $self->getUnpack();
    my @itemvalue = unpack($packing, $self->{buffer});
    DEBUG "(PM)Struct::Unpack: unpack($packing, buffer) = @itemvalue\n" if DEBUGCONST;
    foreach my $i (0 .. $#$items) {
        my $recipient = $self->{buffer_recipients}->[$i];
        my $item = $$items[$i];
        my $type = $$types[$i];
        DEBUG "(PM)Struct::Unpack: %s(%s) = '%s' (0x%08x)\n",
            $recipient->{__typedef__},
            $item,
            $itemvalue[$i],
            $itemvalue[$i],
            if DEBUGCONST;
        if($type eq 'T'){
my $oldstructptr = pop(@{$self->{buffer_ptrs}});
my $newstructptr = $itemvalue[$i];
my $SVMemberRef = \$recipient->{$item};

if(!$newstructptr){ #new ptr is null
    if($oldstructptr != $newstructptr){ #old ptr was true
        lazycarp "Win32::API::Struct::Unpack struct pointer".
        " member \"".$item."\" was changed by C function,".
        " possible resource leak";
    }
    $$SVMemberRef = undef;
}
else{ #new ptr is true
    if($oldstructptr != $newstructptr){#old ptr was true, or null, but has changed, leak warning
        lazycarp "Win32::API::Struct::Unpack struct pointer".
        " member \"".$item."\" was changed by C function,".
        " possible resource leak";
    }#create a ::Struct if the slice is undef, user had the slice set to undef
    
    if (!ref($$SVMemberRef)){
        $$SVMemberRef = Win32::API::Struct->new(to_base_struct($type_names->[$i]));
        $$SVMemberRef->Pack(1); #buffer_recipients must be generated, no uninit warnings
    }
#must fix {buffer} with contents of the new struct, $structptr might be
#null or might be a SVPV from a ::Struct that was ignored, in any case,
#a foreign memory allocator is at work here
    $$SVMemberRef->{buffer} = Win32::API::ReadMemory($newstructptr, $$SVMemberRef->sizeof)
        if($oldstructptr != $newstructptr);
#always must be called, if new ptr is not null, at this point, C func, did
#one of 2 things, filled the old ::Struct's {buffer} PV, or gave a new struct *
#from its own allocator, there is no way to tell if the struct contents changed
#so Unpack() must be called
    $$SVMemberRef->Unpack();
}
}
    else{ #not a struct ptr
        my $itemvalueref = \$itemvalue[$i];
        Win32::API::_TruncateToWideNull($$itemvalueref)
            if substr($type,0,1) eq 'a' && length($type) > 1;
        $recipient->{$item} = $$itemvalueref;

        # DEBUG "(PM)Struct::Unpack: self.items[$i] = $self->{$$items[$i]}\n";
    }
    }
}

sub FromMemory {
    my ($self, $addr) = @_;
    DEBUG "(PM)Struct::FromMemory: doing Pack\n" if DEBUGCONST;
    $self->Pack();
    DEBUG "(PM)Struct::FromMemory: doing GetMemory( 0x%08x, %d )\n", $addr, $self->sizeof if DEBUGCONST;
    $self->{buffer} = Win32::API::ReadMemory($addr, $self->sizeof);
    $self->Unpack();
    if(DEBUGCONST) {
        DEBUG "(PM)Struct::FromMemory: doing Unpack\n";
        DEBUG "(PM)Struct::FromMemory: structure is now:\n";
        $self->Dump();
        DEBUG "\n";
    }
}

sub Dump {
    my $self   = shift;
    my $prefix = shift;
    foreach my $member (@{$self->{typedef}}) {
        my ($name, $packing, $type) = @$member;
        if (ref($self->{$name})) {
            $self->{$name}->Dump($name);
        }
        else {
            printf "%-20s %-20s %-20s\n", $prefix, $name, $self->{$name};
        }
    }
}

#the LP logic should be moved to parse_prototype, since only
#::API::Call() ever understood the implied LP prefix, Struct::new never did
#is_known then can be inlined away and sub deleted, it is not public API
sub is_known {
    my $name = shift;
    if (exists $Known{$name}) {
        return 1;
    }
    else {
        my $nametest = $name;
        if ($nametest =~ s/^LP//) {
            return exists $Known{$nametest};
        }
        $nametest = $name;
        if($nametest =~ s/\*$//){
            return exists $Known{$nametest};
        }
        return 0;
    }
}

sub TIEHASH {
    return Win32::API::Struct::new(@_);
}

sub EXISTS {

}

sub FETCH {
    my $self = shift;
    my $key  = shift;

    if ($key eq 'sizeof') {
        return $self->sizeof;
    }
    my @members = map { $_->[0] } @{$self->{typedef}};
    if (grep(/^\Q$key\E$/, @members)) {
        return $self->{$key};
    }
    else {
        warn "'$key' is not a member of Win32::API::Struct $self->{__typedef__}";
    }
}

sub STORE {
    my $self = shift;
    my ($key, $val) = @_;
    my @members = map { $_->[0] } @{$self->{typedef}};
    if (grep(/^\Q$key\E$/, @members)) {
        $self->{$key} = $val;
    }
    else {
        warn "'$key' is not a member of Win32::API::Struct $self->{__typedef__}";
    }
}

sub FIRSTKEY {
    my $self = shift;
    my @members = map { $_->[0] } @{$self->{typedef}};
    return $members[0];
}

sub NEXTKEY {
    my $self    = shift;
    my $key     = shift;
    my @members = map { $_->[0] } @{$self->{typedef}};
    for my $i (0 .. $#members - 1) {
        return $members[$i + 1] if $members[$i] eq $key;
    }
    return undef;
}

1;

__END__

#######################################################################
# DOCUMENTATION
#

=head1 NAME

Win32::API::Struct - C struct support package for Win32::API

=head1 SYNOPSIS

  use Win32::API;
  
  Win32::API::Struct->typedef( 'POINT', qw(
    LONG x; 
    LONG y; 
  ));
  
  my $Point = Win32::API::Struct->new( 'POINT' ); 
  $Point->{x} = 1024;
  $Point->{y} = 768;

  #### alternatively
  
  tie %Point, 'Win32::API::Struct', 'POINT';
  $Point{x} = 1024;
  $Point{y} = 768;


=head1 ABSTRACT

This module enables you to define C structs for use with
Win32::API. 

See L<Win32::API/USING STRUCTURES> for more info about its usage.

=head1 DESCRIPTION

This module is automatically imported by Win32::API, so you don't 
need to 'use' it explicitly. The main methods are C<typedef> and
C<new>, which are documented below.

=over 4

=item C<typedef NAME, TYPE, MEMBER, TYPE, MEMBER, ...>

This method defines a structure named C<NAME>. The definition consists
of types and member names, just like in C. In fact, most of the
times you can cut the C definition for a structure and paste it
verbatim to your script, enclosing it in a C<qw()> block. The 
function takes care of removing the semicolon after the member
name. Win32::API::Struct does B<NOT> support Enums, Unions, or Bitfields.
C<NAME> must not end in C<*>, typedef creates structs, not struct pointers.
See L<Win32::API::Type/"typedef">
on how to create a struct pointer type. Returns true on success, and undef on error.
On error it L<warns|perlfunc/warn> with the specific reason.

The synopsis example could be written like this:

  Win32::API::Struct->typedef('POINT', 'LONG', 'x', 'LONG', 'y');

But it could also be written like this (note the indirect object
syntax), which is pretty cool:

  typedef Win32::API::Struct POINT => qw{
    LONG x; 
    LONG y; 
  };

L<Win32::API/Call> automatically knows that an 'LPNAME' type, refers
to a 'NAME' type struct. Also see L<Win32::API::Type/"typedef"> on how to declare
pointers to struct types.

Unlike in Win32::API, a single non-array char or CHAR struct member in a
struct is numeric, NOT the first character of a string. UTF16 strings pointers
will be garbage on read back (passing in works, returning doesn't) since
the NULL character will often be the 2nd byte of the UTF16 string.

=item C<new NAME>

This creates a structure (a Win32::API::Struct object) of the
type C<NAME> (it must have been defined with C<typedef>). In Perl,
when you create a structure, all the members are undefined. But
when you use that structure in C (eg. a Win32::API call), you
can safely assume that they will be treated as zero (or NULL).

=item C<sizeof>

This returns the size, in bytes, of the structure. Acts just like
the C function of the same name. It is particularly useful for 
structures that need a member to be initialized to the structure's
own size.

=item C<align [SIZE]>

Sets or returns the structure alignment (eg. how the structure is
stored in memory). This is a very advanced option, and you normally 
don't need to mess with it. 
All structures in the Win32 Platform SDK should work without it. 
But if you define your own structure, you may need to give it an 
explicit alignment. In most cases, passing a C<SIZE> of 'auto' 
should keep the world happy.

=back

=head2 THE C<tie> INTERFACE

Instead of creating an object with the C<new> method, you can
tie a hash, which will hold the desired structure, using the 
C<tie> builtin function:

  tie %structure, Win32::API::Struct => 'NAME';

The differences between the tied and non-tied approaches are:

=over 4

=item *
with tied structures, you can access members directly as
hash lookups, eg.

  # tied              # non-tied
  $Point{x}    vs.    $Point->{x}

=item *
with tied structures, when you try to fetch or store a
member that is not part of the structure, it will result
in a warning, eg.

  print $Point{z};
  # this will warn: 'z' is not a member of Win32::API::Struct POINT

=item *
when you pass a tied structure as a Win32::API parameter, 
remember to backslash it, eg.

  # tied                            # non-tied
  GetCursorPos( \%Point )    vs.    GetCursorPos( $Point )

=back

=head2 FOREIGN MEMORY ALLOCATORS

Using Win32::API::Struct is not recommended in situations where a C function
will return results to you by putting a pointer to a string or a pointer to
another struct into your supplied struct. Win32::API::Struct will do its best
to detect that a new pointer appeared and to read it contents into Perl, but
that pointer will be tossed away after being read. If this pointer is
something you must explicitly free, you have leaked it by using
Win32::API::Struct to decode it. If this pointer is something you must pass back to
the C API you are using, you lost/leaked it. If you pass NULL, or a ::Struct
pointer in a ::Struct to C API, after the C API call, ::Struct will detect the
pointer changed, it will read the new struct from the new pointer into
Perl, and a new child ::Struct will appear in the hash slice
of the parent ::Struct, if you pass this new child ::Struct into the C API
it will be a B<COPY> of the struct the C API from Perl's allocation placed
in the parent ::Struct. For C++-like APIs, this will be unacceptable and lead to
crashes as the C Functions tries to free a memory block that didn't come from the
allocator of the C Function. Windows has many memory allocators, each CRT
(VS 2, 3, 4, 5, NT/6, 7.0, 7.1, 8, 9, 10) malloc, LocalAlloc, GlobalAlloc,
HeapAlloc, (each version of C++ Runtime Library) "new", CoGetMalloc, CoTaskMemAlloc,
NetApiBufferAllocate, VirtualAlloc, CryptMemAlloc, AllocADsMem, SHAlloc,
SnmpUtilMemAlloc. None of these allocators' pointers are compatible with Perl's
allocator. Some C APIs give you static global buffers which never are freed or freed
automatically in the next call to a function from to that DLL.

With foreign allocators, its best to treat to write a pointer class, bless the
ref to scalar integer (holding the pointer) into that class to ensure that the
DESTROY method will free the pointer and you never leak it, and your write
method accessors using L<perlfunc/pack>, L<Win32::API/ReadMemory> and
L<Win32::API/WriteMemory> around the pointer.


=head1 AUTHOR

Aldo Calpini ( I<dada@perl.it> ).

=head1 MAINTAINER

Cosimo Streppone ( I<cosimo@cpan.org> ).

=cut
